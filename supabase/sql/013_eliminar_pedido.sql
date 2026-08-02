-- 013_eliminar_pedido.sql
-- Supabase backend — borrar un pedido desde el panel.
--
-- Run after 012_consulta_solo_por_numero.sql. Idempotent.
--
-- POR QUÉ NO EXISTÍA HASTA AHORA: 010_orders.sql revocó DELETE sobre `orders` y no le dio
-- política de borrado a nadie, a propósito — un pedido es un registro de una venta, y
-- borrarlo destruye la única constancia que queda de ella. Se agrega porque el dueño lo
-- pidió para limpiar pedidos de prueba y pedidos equivocados.
--
-- SIGUE SIN HABER POLÍTICA NI GRANT DE DELETE. El borrado pasa exclusivamente por esta
-- función, que verifica que quien llama sea admin. Un PATCH o un DELETE directo desde
-- PostgREST se sigue rechazando, así que no hay forma de borrar un pedido "sin querer"
-- desde una petición mal armada.
--
-- ES DEFINITIVO Y ARRASTRA TODO: order_items y order_status_history cuelgan de orders con
-- ON DELETE CASCADE, así que se van con él. No hay papelera ni deshacer — por eso el panel
-- pide confirmación antes de llamar acá.

create or replace function public.eliminar_pedido(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- GRANT EXECUTE TO authenticated significa que cualquier usuario con sesión llega a este
  -- cuerpo. Esta comprobación tiene que ser la primera instrucción ejecutable.
  if not public.is_admin() then
    raise exception 'eliminar_pedido: caller is not an admin' using errcode = '42501';
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'eliminar_pedido: unknown order %', p_order_id using errcode = '23503';
  end if;

  delete from public.orders where id = p_order_id;
end $$;

revoke all    on function public.eliminar_pedido(uuid) from public, anon;
grant  execute on function public.eliminar_pedido(uuid) to authenticated;
