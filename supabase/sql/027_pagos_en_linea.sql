-- 027_pagos_en_linea.sql
-- Supabase backend — pagos en línea con Wompi (docs/plan-pagos-en-linea.md, fase 1).
--
-- Run after 026_photo_crop_decimales.sql. Idempotent: `create table if not exists`, cada policy
-- y cada trigger se borran antes de crearse, `create or replace function`. Volver a pegar este
-- archivo nunca debe dar error.
--
-- SE CORRE ANTES DE PUBLICAR EL CÓDIGO, y no rompe nada en el intervalo: solo agrega una tabla
-- y funciones nuevas. Las tres funciones que se reescriben (pedido_publico, expire_stale_orders,
-- pedidos_por_recordar) hacen lo mismo que antes mientras no haya ningún pago en línea, que es
-- justo lo que pasa hasta que se encienda PAGOS_EN_LINEA.
--
-- QUÉ CAMBIA EN EL MODELO: hasta acá el pago lo confirmaba la dueña a mano
-- (confirm_order_payment, 010) después de ver el comprobante por WhatsApp. Desde acá un pedido
-- también puede quedar pagado solo, cuando Wompi aprueba la transacción. El camino manual
-- sigue existiendo para las transferencias directas.
--
-- QUIÉN ESCRIBE: solo el servidor de la tienda, con service_role (src/lib/pagos.ts). El panel
-- lee los intentos pero no puede crear ni modificar ninguno, por la misma razón que no puede
-- escribir order_notifications (021): un pago marcado como aprobado sin que Wompi lo haya
-- aprobado sería un rastro que miente, y además aprobaría el pedido.
--
-- SIN DATOS PERSONALES, A PROPÓSITO: la tabla guarda la referencia, el id de la transacción,
-- el monto, el estado y el medio de pago. No guarda el correo, el nombre ni el documento que
-- viajan en la transacción de Wompi. Así anonimizar_pedidos_vencidos() (025) no tiene que
-- tocarla para cumplir la política de datos.

-- ============================================================================
-- Tabla: un intento de pago por fila
-- ============================================================================
-- POR QUÉ INTENTOS Y NO UNA COLUMNA EN orders: Wompi exige una referencia única por compra y
-- no deja reusar una que ya se completó. Para no depender de cuándo la da por usada, cada vez
-- que el cliente pulsa "Pagar ahora" se crea un intento con una referencia nueva. Si cierra el
-- checkout y vuelve mañana a pagar, son dos filas.

create table if not exists public.order_payments (
  id                  uuid        primary key default gen_random_uuid(),
  order_id            uuid        not null references public.orders(id) on delete cascade,

  -- Texto y no un enum, igual que orders.carrier: si algún día se suma otra pasarela, es un
  -- valor nuevo y no una migración de tipos.
  provider            text        not null default 'wompi',

  -- BQ-483920-3f9a1c2b: el número de pedido más un sufijo aleatorio. El número va adelante
  -- para que la dueña reconozca el pedido en el dashboard de Wompi sin abrir el panel.
  reference           text        not null unique,

  -- Copiados del pedido al crear el intento. Es contra ESTO que se compara lo que Wompi dice
  -- que cobró: si no coincide, el pago no aprueba el pedido.
  amount_in_cents     bigint      not null check (amount_in_cents > 0),
  currency            text        not null default 'COP',

  -- El id de la transacción en Wompi. Null mientras el cliente no haya empezado a pagar (abrió
  -- el checkout y lo cerró, por ejemplo). Si dentro del mismo checkout hubo reintentos, es el de
  -- la transacción que importa (ver registrar_transaccion_pago).
  provider_tx_id      text        unique,

  -- CREATED = intento creado, sin transacción conocida todavía. El resto son los estados de
  -- Wompi tal cual: PENDING mientras se procesa (PSE, Nequi esperando la confirmación en el
  -- celular) y cuatro finales.
  status              text        not null default 'CREATED'
                        check (status in ('CREATED', 'PENDING', 'APPROVED',
                                          'DECLINED', 'VOIDED', 'ERROR')),

  -- CARD, NEQUI, PSE, DAVIPLATA, BANCOLOMBIA_QR… Texto libre: Wompi suma medios de pago sin
  -- avisar y un CHECK los rechazaría.
  payment_method_type text,

  -- Algo que la dueña tiene que mirar a mano:
  --   monto_distinto  → Wompi cobró otro monto u otra moneda. No aprueba el pedido.
  --   pago_duplicado  → se aprobó, pero el pedido ya estaba pagado (otro intento, o una
  --                     transferencia que se confirmó a mano). Hay que reembolsarlo.
  anomaly             text        check (anomaly is null
                                         or anomaly in ('monto_distinto', 'pago_duplicado')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists order_payments_order_id_idx
  on public.order_payments (order_id, created_at);

-- La conciliación programada (src/lib/pagos.ts) busca los intentos que siguen en proceso.
create index if not exists order_payments_pendientes_idx
  on public.order_payments (updated_at) where status = 'PENDING';

-- Reusa la función de 001_schema.sql.
drop trigger if exists set_updated_at on public.order_payments;
create trigger set_updated_at before update on public.order_payments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — solo lectura para admins, como el resto de las tablas de pedidos
-- ============================================================================

alter table public.order_payments enable row level security;

drop policy if exists order_payments_select_admin on public.order_payments;
create policy order_payments_select_admin on public.order_payments
  for select to authenticated using ((select public.is_admin()));

revoke all on table public.order_payments from anon;
revoke insert, update, delete, truncate on table public.order_payments from anon, authenticated;

-- ============================================================================
-- pago_en_proceso(uuid) — la ÚNICA definición de "hay un pago andando"
-- ============================================================================
-- Un intento con transacción conocida que Wompi todavía tiene en PENDING, creado hace menos de
-- una hora. La usan cuatro funciones y las cuatro tienen que coincidir: si la página dijera
-- "tu pago está en proceso" mientras el barrido vence el pedido, o el recordatorio le pidiera
-- pagar a quien está pagando, el cliente recibiría dos mensajes contradictorios.
--
-- POR QUÉ UNA HORA: PSE y Nequi se resuelven en minutos. Un PENDING de más de una hora es un
-- pago que el cliente abandonó a medias (cerró la página del banco), y dejarlo bloqueando para
-- siempre impediría volver a intentar. Si aun así se aprueba más tarde, no se pierde nada:
-- registrar_transaccion_pago() aprueba también un pedido vencido.

create or replace function public.pago_en_proceso(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.order_payments p
     where p.order_id = p_order_id
       and p.status = 'PENDING'
       and p.provider_tx_id is not null
       and p.created_at > now() - interval '1 hour'
  );
$$;

-- Nadie la llama de afuera: la usan las funciones de abajo, que son SECURITY DEFINER.
revoke all on function public.pago_en_proceso(uuid) from public, anon, authenticated;

-- ============================================================================
-- crear_intento_pago(text) — el cliente pulsó "Pagar ahora"
-- ============================================================================
-- Recibe el token del pedido (la llave del cliente, 010) y devuelve lo que el servidor necesita
-- para firmar y abrir el checkout de Wompi. El MONTO SALE DE ACÁ, de orders.total: el navegador
-- no lo manda ni lo puede cambiar.
--
-- Cuando no se puede pagar devuelve { ok: false, motivo } en vez de lanzar: el endpoint
-- (src/pages/api/pagos/iniciar.ts) traduce cada motivo a un mensaje para el cliente, y con una
-- excepción tendría que adivinar cuál fue por el texto del error.
--
-- Solo service_role: la llama el endpoint, nunca un navegador.

create or replace function public.crear_intento_pago(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.orders%rowtype;
  v_intentos integer;
  v_ref      text;
begin
  -- FOR UPDATE: dos clics casi simultáneos en "Pagar ahora" no pueden pasar los dos el control
  -- de "pago en proceso" antes de que exista ninguno de los dos intentos.
  select * into v_o from public.orders where public_token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  if v_o.paid_at is not null then
    return jsonb_build_object('ok', false, 'motivo', 'pagado');
  end if;

  -- Solo un pedido que espera el pago. 'no_confirmado' (vencido) queda afuera: para reactivarlo
  -- el cliente escribe por WhatsApp, como dice la página de seguimiento. Cualquier otro estado
  -- sin paid_at es un pedido que la dueña movió a mano, y cobrarlo en línea sería un error.
  if v_o.status <> 'pendiente_pago' then
    return jsonb_build_object('ok', false, 'motivo', 'no_disponible');
  end if;

  -- El barrido de expire_stale_orders() corre cada 30 minutos: entre las 24 horas y la
  -- siguiente corrida el pedido todavía figura pendiente, pero ya venció.
  if v_o.created_at < now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'motivo', 'vencido');
  end if;

  if public.pago_en_proceso(v_o.id) then
    return jsonb_build_object('ok', false, 'motivo', 'en_proceso');
  end if;

  -- Tope: cada clic crea una fila, y el token del pedido es todo lo que hace falta para pulsar.
  select count(*) into v_intentos from public.order_payments where order_id = v_o.id;
  if v_intentos >= 20 then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  end if;

  -- Ocho caracteres hexadecimales al azar detrás del número de pedido. La colisión solo
  -- importaría dentro del mismo pedido (el número ya distingue a los demás), y con veinte
  -- intentos como máximo es imposible en la práctica; si pasara, el UNIQUE la detiene y el
  -- cliente vuelve a pulsar.
  v_ref := v_o.order_number || '-' || substr(md5(gen_random_uuid()::text), 1, 8);

  insert into public.order_payments (order_id, reference, amount_in_cents, currency)
  values (v_o.id, v_ref, v_o.total::bigint * 100, 'COP');

  return jsonb_build_object(
    'ok',              true,
    'reference',       v_ref,
    'amount_in_cents', v_o.total::bigint * 100,
    'currency',        'COP',
    'order_number',    v_o.order_number,
    -- Para prellenar el checkout de Wompi: el cliente no tiene que volver a escribirlos. Van
    -- al servidor de la tienda, que los pasa al navegador del MISMO cliente que los escribió.
    'customer_name',   v_o.customer_name,
    'customer_email',  v_o.customer_email,
    'customer_phone',  v_o.customer_phone
  );
end $$;

revoke all    on function public.crear_intento_pago(text) from public, anon, authenticated;
grant  execute on function public.crear_intento_pago(text) to service_role;

-- ============================================================================
-- registrar_transaccion_pago(...) — lo que Wompi dice de una transacción
-- ============================================================================
-- La llama el servidor DESPUÉS de consultar la transacción a Wompi con la llave privada. Los
-- datos que llegan acá vienen de esa consulta, nunca del navegador ni del cuerpo de un webhook
-- sin verificar (src/lib/pagos.ts, procesarTransaccion).
--
-- La pueden disparar tres caminos para la misma transacción —el webhook (que Wompi reintenta),
-- la página de regreso (que el cliente puede recargar) y la conciliación programada—, así que
-- es IDEMPOTENTE: el pedido se aprueba una sola vez, y `aprobado_ahora` es true solo en la
-- llamada que lo aprobó. Con eso el servidor manda el correo una sola vez.
--
-- Cuando aprueba, hace en UNA transacción lo mismo que confirm_order_payment() (010): marca
-- paid_at, pasa el pedido a 'aprobado' y escribe la línea del historial. También acepta un
-- pedido 'no_confirmado', por la misma razón: un PSE que se aprobó después de las 24 horas es
-- una venta, no un error.
--
-- Solo service_role.

create or replace function public.registrar_transaccion_pago(
  p_reference       text,
  p_tx_id           text,
  p_status          text,
  p_method          text,
  p_amount_in_cents bigint,
  p_currency        text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p        public.order_payments%rowtype;
  v_o        public.orders%rowtype;
  v_nuevo    text;
  v_anomalia text;
  v_metodo   text;
  v_ignorar  boolean := false;
  -- El estado anotado de la transacción que sigue la fila (CREATED si no tiene ninguna).
  v_previo   text;
  v_aprobado boolean := false;
begin
  if p_status is null or p_status not in ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR') then
    raise exception 'registrar_transaccion_pago: estado desconocido %', p_status
      using errcode = '22023';
  end if;

  select * into v_p from public.order_payments where reference = p_reference for update;
  if not found then
    -- Una transacción de otra tienda que comparte la cuenta de Wompi, o de una prueba vieja.
    -- No es un error de este lado: el servidor responde 200 y lo deja en el log.
    return jsonb_build_object('encontrado', false);
  end if;
  v_previo := v_p.status;

  -- UNA REFERENCIA PUEDE TENER MÁS DE UNA TRANSACCIÓN. Wompi documenta reintentos de pago: si
  -- la tarjeta rebota, el cliente puede volver a intentar sin salir del checkout, y la segunda
  -- transacción puede llevar la misma referencia. La fila sigue a la transacción que importa:
  --   * una APROBADA manda sobre cualquier otra;
  --   * una que sigue EN PROCESO manda sobre el rechazo o el PENDING de otra;
  --   * entre dos rechazos, la última que llegó.
  -- Una SEGUNDA transacción aprobada con la misma referencia es un cobro de más: no reemplaza a
  -- la primera, se marca para devolverla.
  if v_p.provider_tx_id is not null and v_p.provider_tx_id <> p_tx_id then
    if v_previo = 'APPROVED' then
      if p_status = 'APPROVED' then
        update public.order_payments set anomaly = 'pago_duplicado' where id = v_p.id;
      end if;
      v_ignorar := true;
    elsif v_previo = 'PENDING' and p_status <> 'APPROVED' then
      v_ignorar := true;
    else
      -- La otra transacción pasa a ser la de esta fila. Para las reglas de abajo es nueva.
      v_previo := 'CREATED';
    end if;
  end if;

  if v_ignorar then
    return jsonb_build_object(
      'encontrado',     true,
      'order_id',       v_p.order_id,
      'estado',         v_previo,
      'anomalia',       (select anomaly from public.order_payments where id = v_p.id),
      'aprobado_ahora', false
    );
  end if;

  -- Los eventos pueden llegar desordenados (un PENDING atrasado después del APPROVED). Un
  -- estado final no vuelve a PENDING, y de APPROVED solo se puede pasar a VOIDED (Wompi
  -- anuló el cobro de una tarjeta).
  v_nuevo := case
    when v_previo in ('APPROVED', 'DECLINED', 'VOIDED', 'ERROR') and p_status = 'PENDING'
      then v_previo
    when v_previo = 'APPROVED' and p_status <> 'VOIDED'
      then v_previo
    else p_status
  end;

  -- El monto se compara contra el intento, que se copió de orders.total al crearlo.
  if p_amount_in_cents is distinct from v_p.amount_in_cents
     or p_currency is distinct from v_p.currency then
    v_anomalia := 'monto_distinto';
  end if;

  update public.order_payments
     set provider_tx_id      = p_tx_id,
         status              = v_nuevo,
         payment_method_type = coalesce(nullif(btrim(p_method), ''), payment_method_type),
         anomaly             = coalesce(v_anomalia, anomaly)
   where id = v_p.id;

  -- Aprueba solo la primera vez que este intento llega a APPROVED, y solo si el monto es el
  -- correcto. Un VOIDED después de aprobado NO desaprueba el pedido: eso lo decide la dueña.
  if v_nuevo = 'APPROVED' and v_previo <> 'APPROVED' and v_anomalia is null then
    select * into v_o from public.orders where id = v_p.order_id for update;

    if v_o.paid_at is not null then
      -- Ya estaba pagado (otro intento, o una transferencia confirmada a mano): el cobro
      -- existe y hay que devolverlo desde el dashboard de Wompi.
      update public.order_payments set anomaly = 'pago_duplicado' where id = v_p.id;
    else
      -- El nombre del medio de pago va en la línea del historial, que el cliente ve en su
      -- página de seguimiento: "Pago aprobado en línea (Nequi)".
      v_metodo := case upper(coalesce(p_method, ''))
        when 'CARD'                 then 'tarjeta'
        when 'NEQUI'                then 'Nequi'
        when 'DAVIPLATA'            then 'DaviPlata'
        when 'PSE'                  then 'PSE'
        when 'BANCOLOMBIA_TRANSFER' then 'Botón Bancolombia'
        when 'BANCOLOMBIA_QR'       then 'QR'
        else null
      end;

      -- Solo un pedido que esperaba el pago pasa a 'aprobado'. Si la dueña ya lo había movido
      -- más adelante sin marcar el pago, no se lo devuelve a un estado anterior.
      update public.orders
         set paid_at = now(),
             status  = case when status in ('pendiente_pago', 'no_confirmado')
                            then 'aprobado' else status end
       where id = v_o.id;

      if v_o.status in ('pendiente_pago', 'no_confirmado') then
        insert into public.order_status_history (order_id, status, note, created_by)
        values (v_o.id, 'aprobado',
                case when v_metodo is null then 'Pago aprobado en línea'
                     else 'Pago aprobado en línea (' || v_metodo || ')' end,
                null);
      end if;

      v_aprobado := true;
    end if;
  end if;

  return jsonb_build_object(
    'encontrado',     true,
    'order_id',       v_p.order_id,
    'estado',         v_nuevo,
    'anomalia',       coalesce(v_anomalia, (select anomaly from public.order_payments where id = v_p.id)),
    'aprobado_ahora', v_aprobado
  );
end $$;

revoke all    on function public.registrar_transaccion_pago(text, text, text, text, bigint, text)
  from public, anon, authenticated;
grant  execute on function public.registrar_transaccion_pago(text, text, text, text, bigint, text)
  to service_role;

-- ============================================================================
-- pedido_publico(uuid) — suma `pago`
-- ============================================================================
-- Igual que en 011 salvo por `pago`, que le dice a la página de seguimiento qué botón mostrar:
--   'pagado'     → nada que hacer.
--   'en_proceso' → "tu pago se está procesando", sin botón (no se puede pagar dos veces).
--   'pendiente'  → "Pagar ahora".
-- No expone referencias, ids de transacción ni el medio de pago: con el número de pedido
-- (012) cualquiera abre esta vista, y nada de eso le sirve al cliente.

create or replace function public.pedido_publico(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number',    o.order_number,
    'status',          o.status,
    'created_at',      o.created_at,
    'estimated_date',  o.estimated_date,
    'carrier',         o.carrier,
    'tracking_number', o.tracking_number,
    'shipped_at',      o.shipped_at,
    'customer_name',   o.customer_name,
    'ship_city',       o.ship_city,
    'subtotal',        o.subtotal,
    'shipping_cost',   o.shipping_cost,
    'total',           o.total,
    'pago', case
      when o.paid_at is not null           then 'pagado'
      when public.pago_en_proceso(o.id)    then 'en_proceso'
      else 'pendiente'
    end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_name',   i.product_name,
               'category_label', i.category_label,
               'color',          i.color,
               'variant',        i.variant,
               'initials',       i.initials,
               'initials_color', i.initials_color,
               'quantity',       i.quantity,
               'line_total',     i.line_total
             ) order by i.id)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status',     h.status,
               'note',       h.note,
               'created_at', h.created_at
             ) order by h.created_at, h.id)
      from public.order_status_history h where h.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_id;
$$;

revoke all on function public.pedido_publico(uuid) from public, anon, authenticated;

-- ============================================================================
-- expire_stale_orders() — no vence un pedido con el pago andando
-- ============================================================================
-- Igual que en 010 salvo por `pago_en_proceso`. Sin esto, un cliente que empieza un PSE a las
-- 23 h 50 min vería su pedido pasar a "no confirmado" mientras el banco todavía procesa.

create or replace function public.expire_stale_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids uuid[];
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'expire_stale_orders: caller is not an admin' using errcode = '42501';
  end if;

  with vencidos as (
    update public.orders o
       set status = 'no_confirmado'
     where o.status = 'pendiente_pago'
       and o.paid_at is null
       and o.created_at < now() - interval '24 hours'
       and not public.pago_en_proceso(o.id)
    returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from vencidos;

  insert into public.order_status_history (order_id, status, note, created_by)
  select unnest(v_ids), 'no_confirmado',
         'Sin pago confirmado 24 horas después del pedido', null;

  return coalesce(array_length(v_ids, 1), 0);
end $$;

revoke all    on function public.expire_stale_orders() from public, anon;
grant  execute on function public.expire_stale_orders() to authenticated;

-- ============================================================================
-- pedidos_por_recordar(integer, integer) — no le recuerda pagar a quien está pagando
-- ============================================================================
-- Igual que en 023 salvo por `pago_en_proceso`.

create or replace function public.pedidos_por_recordar(
  p_horas integer default 12, p_limite integer default 20
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
  from (
    select o.id, o.order_number, o.public_token, o.customer_name, o.customer_email,
           o.total, o.created_at,
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'product_name', i.product_name, 'variant', i.variant,
                     'initials', i.initials, 'initials_color', i.initials_color,
                     'quantity', i.quantity, 'line_total', i.line_total) order by i.id),
                   '[]'::jsonb)
              from public.order_items i where i.order_id = o.id) as items
      from public.orders o
     where o.status = 'pendiente_pago'
       and o.paid_at is null
       and o.customer_email is not null
       and o.created_at <= now() - make_interval(hours => p_horas)
       and o.created_at >  now() - interval '24 hours'
       and not public.pago_en_proceso(o.id)
       and not exists (
             select 1 from public.order_notifications n
              where n.order_id = o.id and n.tipo = 'recordatorio' and n.sent_at is not null)
     order by o.created_at
     limit greatest(p_limite, 1)
  ) x
$$;

revoke all    on function public.pedidos_por_recordar(integer, integer) from public, anon, authenticated;
grant  execute on function public.pedidos_por_recordar(integer, integer) to service_role;

-- ============================================================================
-- Lo que NO cambia
-- ============================================================================
-- confirm_order_payment() (010) sigue igual: la dueña puede confirmar a mano un pago por
-- transferencia. Si después el cliente también paga en línea, ese intento queda marcado como
-- 'pago_duplicado' para devolverlo.
--
-- El comentario de orders.paid_at en 010 dice "No payment gateway is involved". Desde este
-- archivo ya no es así: paid_at lo pueden poner confirm_order_payment() (a mano) o
-- registrar_transaccion_pago() (Wompi), y sigue siendo la única fuente de verdad de si un
-- pedido está pagado.
