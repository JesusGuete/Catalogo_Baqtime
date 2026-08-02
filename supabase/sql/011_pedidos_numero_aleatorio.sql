-- 011_pedidos_numero_aleatorio.sql
-- Supabase backend — order numbers stop being sequential, and customers can look their
-- order up from the storefront with the number plus their phone.
--
-- Run after 010_orders.sql. Idempotent: `create or replace function`, and the two ALTERs
-- are declarative. Re-pasting this file must never error.
--
-- Changes NOTHING about existing rows: orders already created keep their BQ-00001 number.
-- Only the default for future rows changes.

-- ============================================================================
-- generar_numero_pedido() — BQ- + six random digits
-- ============================================================================
-- WHY RANDOM AND NOT A SEQUENCE: a sequential number tells anyone who places an order how
-- many orders the shop has taken, and how many came in between two of theirs. That is
-- business information the customer has no reason to hold.
--
-- WHY random() IS ENOUGH HERE, even though it is not cryptographic: the number is NOT the
-- key to anything. Reading an order needs either the 122-bit token from the link, or this
-- number PLUS the customer's phone (buscar_pedido, below). The number only has to avoid
-- colliding, not resist guessing.
--
-- The retry loop is for correctness of experience, not of data: the UNIQUE constraint on
-- order_number would catch a collision anyway, but it would surface to whoever is checking
-- out as an incomprehensible error. Six digits over a shop's lifetime of orders makes a
-- second iteration rare and a third essentially impossible; 20 attempts is a generous
-- ceiling that also guarantees this can never loop forever.

create or replace function public.generar_numero_pedido()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_numero text; v_intento integer := 0;
begin
  loop
    v_numero := 'BQ-' || lpad((floor(random() * 1000000))::integer::text, 6, '0');
    exit when not exists (select 1 from public.orders where order_number = v_numero);
    v_intento := v_intento + 1;
    if v_intento >= 20 then
      raise exception 'generar_numero_pedido: no se encontró un número libre en % intentos', v_intento
        using errcode = 'P0001';
    end if;
  end loop;
  return v_numero;
end $$;

alter table public.orders
  alter column order_number set default public.generar_numero_pedido();

-- La secuencia queda sin uso. Se borra acá y no en el rollback porque a partir de ahora
-- nada la referencia: dejarla sería dejar una pista falsa de que los números son
-- correlativos.
drop sequence if exists public.orders_number_seq;

-- ============================================================================
-- pedido_publico(uuid) — la ÚNICA definición de "qué puede ver un cliente"
-- ============================================================================
-- Extraída del cuerpo de get_order_by_token (010_orders.sql) porque ahora hay dos caminos
-- de lectura —el enlace con token y la búsqueda por número + teléfono— y los dos tienen
-- que mostrar exactamente lo mismo. Con el JSON armado en dos lugares, alcanzaba con que
-- alguien agregara un campo en uno solo para que un dato sensible se filtrara por el otro.
--
-- Sigue SIN devolver: customer_doc, ship_address, payment_note, el uuid interno, y el
-- created_by de cada fila del historial.

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

-- Nadie la llama de afuera: es el detalle interno que comparten las dos funciones de
-- abajo, y las dos son SECURITY DEFINER, así que la ejecutan como dueñas.
revoke all on function public.pedido_publico(uuid) from public, anon, authenticated;

-- ============================================================================
-- get_order_by_token(text) — ahora delega
-- ============================================================================

create or replace function public.get_order_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.pedido_publico(o.id) from public.orders o where o.public_token = p_token;
$$;

revoke all    on function public.get_order_by_token(text) from public;
grant  execute on function public.get_order_by_token(text) to anon, authenticated;

-- ============================================================================
-- buscar_pedido(text, text) — la consulta desde la tienda
-- ============================================================================
-- El número de pedido por sí solo NO puede abrir un pedido: son seis dígitos, y un
-- programa los prueba todos en minutos. Con el teléfono como segundo dato, hace falta
-- saber algo del cliente además del número — que es lo mismo que pide cualquier tienda
-- para rastrear un envío.
--
-- Comparación tolerante con cómo escribe la gente: de los DOS campos se miran solo los
-- dígitos. Así valen igual 'BQ-483920', 'bq 483920' y '483920' —mucha gente dicta o copia
-- solo la parte numérica— y también '300 123 4567' o '+57 300 1234567'.
--
-- Quedarse con los dígitos y no con letras+dígitos es deliberado: si solo se quitaran los
-- guiones, 'BQ483920' y '483920' seguirían siendo distintos y el cliente que escribe el
-- número sin el prefijo no encontraría su pedido. Con un único prefijo posible, la parte
-- numérica ya identifica al pedido sin ambigüedad.
--
-- Devuelve null cuando no hay coincidencia, sin distinguir si falló el número o el
-- teléfono: decirlo confirmaría que ese número de pedido existe.

create or replace function public.buscar_pedido(p_numero text, p_telefono text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.pedido_publico(o.id)
    from public.orders o
   where regexp_replace(coalesce(p_numero, ''), '[^0-9]', '', 'g')
       = regexp_replace(o.order_number,         '[^0-9]', '', 'g')
     -- Los ÚLTIMOS 10 dígitos, no todos: el formulario de compra guarda el celular en 10
     -- dígitos exactos, pero al consultar mucha gente lo escribe con el indicativo
     -- ('+57 300 1234567', '0057…'). Comparar la cola hace que las dos formas encuentren
     -- el mismo pedido, y no afloja nada: un celular colombiano ES esos 10 dígitos.
     and right(regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g'), 10)
       = right(regexp_replace(o.customer_phone,         '[^0-9]', '', 'g'), 10)
     -- Dos guardas contra la coincidencia por vacío: sin ellas, mandar los dos campos en
     -- blanco compararía '' con '' y abriría un pedido cualquiera. No debería llegar así
     -- (el formulario los exige y las columnas son NOT NULL), pero esto no puede depender
     -- de que ningún llamador se equivoque.
     and length(regexp_replace(coalesce(p_numero, ''),   '[^0-9]', '', 'g')) >= 4
     and length(regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g')) >= 7
   limit 1;
$$;

revoke all    on function public.buscar_pedido(text, text) from public;
grant  execute on function public.buscar_pedido(text, text) to anon, authenticated;
