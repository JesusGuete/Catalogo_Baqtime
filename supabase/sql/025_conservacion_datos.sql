-- 025_conservacion_datos.sql
-- Supabase backend — los datos personales de un pedido se borran solos al mes.
--
-- Run after 024_autorizacion_datos.sql. Idempotent: `add column if not exists`,
-- `create or replace function`. Volver a pegar este archivo nunca debe dar error. Se puede
-- correr antes o después de publicar el código: mientras la función no exista, la tarea
-- programada del Worker solo anota el error en el log y sigue.
--
-- QUÉ PROMETE LA POLÍTICA (/politica-de-datos, sección 10): los datos personales se guardan
-- hasta un mes después de la entrega — lo mismo que dura la garantía — y un mes después de
-- creado si el pedido nunca se pagó. Pasado eso se borran y queda solo lo que se vendió.
--
-- ANONIMIZAR, NO BORRAR: el pedido sigue existiendo, con su número, sus productos, sus
-- valores y sus fechas. Se reemplazan los datos que identifican a la persona. Así el panel
-- conserva el historial de ventas y una garantía tardía se puede verificar con el número
-- de pedido, sin guardar a quién se le vendió.
--
-- Los valores de reemplazo cumplen los CHECK de `orders` (nombre, teléfono y dirección no
-- vacíos; documento obligatorio fuera de Barranquilla). El correo sí puede quedar NULL.
--
-- OJO: aplica a TODOS los pedidos de este proyecto de Supabase. Si otra tienda (Bagelle)
-- guarda sus pedidos acá, también se le anonimizan con esta regla.

alter table public.orders add column if not exists anonymized_at timestamptz;

-- ============================================================================
-- anonimizar_pedidos_vencidos(integer) — la llama el Worker cada 30 minutos
-- ============================================================================
-- Qué pedidos vencen:
--   * entregado      → un mes después de marcarse entregado (fin de la garantía).
--   * enviado        → un mes y medio después del despacho, por si nunca se marcó
--                      entregado: la entrega tarda días, no semanas, así que para entonces
--                      la garantía ya terminó seguro.
--   * sin pagar      → un mes después de creado (pendiente_pago o no_confirmado).
-- Los pedidos en curso (aprobado, en_produccion, listo_para_envio) no se tocan nunca.
--
-- El tope por corrida evita una actualización gigante si algún día se acumulan muchos;
-- lo que quede sale en la siguiente corrida.

create or replace function public.anonimizar_pedidos_vencidos(p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  with vencidos as (
    select o.id
      from public.orders o
     where o.anonymized_at is null
       and (
         (o.status = 'entregado'
           and coalesce(
                 (select max(h.created_at) from public.order_status_history h
                   where h.order_id = o.id and h.status = 'entregado'),
                 o.updated_at
               ) < now() - interval '1 month')
         or (o.status = 'enviado'
             and coalesce(o.shipped_at, o.updated_at) < now() - interval '1 month 15 days')
         or (o.status in ('pendiente_pago', 'no_confirmado')
             and o.paid_at is null
             and o.created_at < now() - interval '1 month')
       )
     order by o.created_at
     limit greatest(p_limite, 1)
  )
  update public.orders o
     set customer_name     = 'Titular suprimido',
         customer_phone    = '0',
         customer_email    = null,
         customer_doc      = 'SUPRIMIDO',
         ship_address      = 'Suprimida',
         -- Pueden nombrar a la persona: la nota de pago suele llevar el nombre de quien
         -- transfirió, la guía deja ver el destinatario en el rastreador, y el error de un
         -- correo fallido puede citar la dirección.
         payment_note      = null,
         tracking_number   = null,
         email_error       = null,
         marketing_consent = false,
         anonymized_at     = now()
    from vencidos v
   where o.id = v.id;

  get diagnostics v_n = row_count;

  update public.order_notifications n
     set error = null
    from public.orders o
   where n.order_id = o.id
     and o.anonymized_at is not null
     and n.error is not null;

  return v_n;
end $$;

revoke all    on function public.anonimizar_pedidos_vencidos(integer) from public, anon, authenticated;
grant  execute on function public.anonimizar_pedidos_vencidos(integer) to service_role;
