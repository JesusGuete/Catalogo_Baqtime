-- 012_consulta_solo_por_numero.sql
-- Supabase backend — la consulta pública del pedido pasa a pedir SOLO el número.
--
-- Run after 011_pedidos_numero_aleatorio.sql. Idempotent.
--
-- DECISIÓN DEL DUEÑO, TOMADA CON EL RIESGO SOBRE LA MESA (2026-08-01). La versión
-- anterior pedía número + teléfono justamente porque el número solo son seis dígitos: un
-- millón de combinaciones, que un script recorre en horas y devuelve el nombre, la ciudad
-- y el contenido del pedido de cada cliente. Se le ofreció subir el número a nueve dígitos
-- para cerrar eso sin pedir un segundo dato, y eligió mantener seis.
--
-- Queda escrito acá para que nadie lo lea más adelante como un descuido: es una decisión
-- de negocio, no un olvido. Si alguna vez se quiere revertir, alcanza con volver a la
-- firma de dos argumentos de 011 y agregar el campo al formulario.
--
-- Lo que NO cambia: la lista blanca de campos sigue siendo la de pedido_publico(), así que
-- ni con el número en la mano salen el documento, la dirección exacta ni las notas de
-- pago.

-- La firma cambia (dos argumentos -> uno), así que `create or replace` no alcanza: dejaría
-- las dos versiones conviviendo y PostgREST elegiría cualquiera.
drop function if exists public.buscar_pedido(text, text);

create or replace function public.buscar_pedido(p_numero text)
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
     -- Sin esto, mandar el campo vacío compararía '' con '' y devolvería un pedido
     -- cualquiera. El formulario ya lo exige, pero esto no puede depender de eso.
     and length(regexp_replace(coalesce(p_numero, ''), '[^0-9]', '', 'g')) >= 4
   limit 1;
$$;

revoke all    on function public.buscar_pedido(text) from public;
grant  execute on function public.buscar_pedido(text) to anon, authenticated;
