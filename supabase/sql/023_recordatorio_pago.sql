-- 023_recordatorio_pago.sql
-- Supabase backend — el recordatorio de pago (fase 3 del correo).
--
-- Run after 022_publish_catalog_paleta.sql. Idempotent: el CHECK se borra antes de crearse,
-- `create or replace function`. Volver a pegar este archivo nunca debe dar error. No toca
-- ningún dato ni ninguna tabla existente: solo amplía el CHECK de order_notifications y suma
-- una función, así que se puede correr antes o después de publicar el código.
--
-- QUÉ HACE: a las 12 horas de creado, un pedido que sigue sin pago recibe UN correo de
-- recordatorio. El envío lo hace el Worker de la tienda con una tarea programada (cada 30
-- minutos, ver src/worker.ts); acá solo vive (1) el rastro del envío y (2) la consulta de a
-- quién le toca.
--
-- EL RASTRO ES EL MISMO de los avisos de estado (021): una fila en order_notifications con
-- tipo = 'recordatorio'. Eso es lo que impide mandar dos veces el mismo recordatorio, y lo que
-- deja ver en el panel si salió o falló.

-- ============================================================================
-- order_notifications admite el tipo 'recordatorio'
-- ============================================================================

alter table public.order_notifications drop constraint if exists order_notifications_tipo_check;
alter table public.order_notifications add constraint order_notifications_tipo_check
  check (tipo in ('aprobado', 'enviado', 'entregado', 'recordatorio'));

-- ============================================================================
-- registrar_aviso_estado(uuid, text, text) — ahora también acepta 'recordatorio'
-- ============================================================================
-- Igual que en 021 salvo por la lista de tipos válidos.

create or replace function public.registrar_aviso_estado(
  p_order_id uuid, p_tipo text, p_error text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tipo not in ('aprobado', 'enviado', 'entregado', 'recordatorio') then
    raise exception 'registrar_aviso_estado: tipo desconocido %', p_tipo using errcode = '22023';
  end if;

  if p_error is null then
    insert into public.order_notifications (order_id, tipo, sent_at, error)
    values (p_order_id, p_tipo, now(), null)
    on conflict (order_id, tipo)
    do update set sent_at = now(), error = null, updated_at = now();
  else
    insert into public.order_notifications (order_id, tipo, sent_at, error)
    values (p_order_id, p_tipo, null, left(p_error, 500))
    on conflict (order_id, tipo)
    do update set error = left(p_error, 500), updated_at = now();
  end if;
end $$;

revoke all    on function public.registrar_aviso_estado(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.registrar_aviso_estado(uuid, text, text) to service_role;

-- ============================================================================
-- pedidos_por_recordar(integer, integer) — a quién le toca el recordatorio
-- ============================================================================
-- Devuelve, como un arreglo JSON, los pedidos que:
--   * siguen en 'pendiente_pago' y sin paid_at,
--   * tienen correo,
--   * llevan al menos p_horas desde que se crearon,
--   * todavía no vencen (expire_stale_orders() los pasa a 'no_confirmado' a las 24 h, y a
--     un pedido vencido ya no tiene sentido pedirle que pague),
--   * y NO tienen un recordatorio ya enviado.
-- Un recordatorio que FALLÓ no cuenta como enviado: el pedido vuelve a aparecer en la
-- siguiente corrida y se reintenta, hasta que salga o venza.
--
-- Cada pedido trae sus productos: el correo arma el mismo mensaje de WhatsApp que la página
-- de gracias, y ese mensaje nombra lo que se compró.
--
-- Solo lee. No marca nada: marcar es registrar_aviso_estado(), que se llama DESPUÉS de
-- hablar con el proveedor de correo. Así un fallo entre una cosa y otra no deja un
-- recordatorio "enviado" que nunca salió.
--
-- Solo service_role: la llama el Worker de la tienda desde su tarea programada.

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
       and not exists (
             select 1 from public.order_notifications n
              where n.order_id = o.id and n.tipo = 'recordatorio' and n.sent_at is not null)
     order by o.created_at
     limit greatest(p_limite, 1)
  ) x
$$;

revoke all    on function public.pedidos_por_recordar(integer, integer) from public, anon, authenticated;
grant  execute on function public.pedidos_por_recordar(integer, integer) to service_role;
