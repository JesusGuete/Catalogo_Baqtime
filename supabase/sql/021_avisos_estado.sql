-- 021_avisos_estado.sql
-- Supabase backend — el rastro de los correos de cambio de estado (fase 2 del correo).
--
-- Run after 020_correo_obligatorio.sql. Idempotent: `create table if not exists`, cada
-- policy se borra antes de crearse, `create or replace function`. Volver a pegar este
-- archivo nunca debe dar error. No toca ninguna tabla ni función existente, así que se puede
-- correr antes o después de publicar el código.
--
-- QUÉ GUARDA: cuando el dueño cambia el estado de un pedido desde el panel puede avisarle al
-- cliente por correo (pago confirmado, enviado, entregado). Acá queda UNA fila por pedido y
-- por tipo de aviso con cómo salió el último intento:
--   * sent_at — cuándo salió el último correo que el proveedor aceptó.
--   * error   — por qué falló el ÚLTIMO intento, o null si salió bien.
-- Sirve para dos cosas: que el panel muestre "ya se le avisó el 6 oct" y pregunte antes de
-- repetirlo (cambiar un estado de ida y vuelta no debe mandar tres correos iguales), y que un
-- aviso que falló se vea y se pueda reintentar. Es el mismo criterio de email_sent_at /
-- email_error en orders (019), solo que ahí hay un único correo y acá hay tres.
--
-- El envío en sí lo hace el servidor de la tienda (src/pages/api/pedidos/notificar-estado.ts).

-- ============================================================================
-- Tabla
-- ============================================================================

create table if not exists public.order_notifications (
  order_id   uuid        not null references public.orders(id) on delete cascade,
  -- Los tres avisos que existen. Un CHECK y no un enum: sumar un cuarto es agregar un valor
  -- acá y una plantilla en src/lib/correo-estado.ts, sin tocar tipos de Postgres.
  tipo       text        not null check (tipo in ('aprobado', 'enviado', 'entregado')),
  sent_at    timestamptz,
  error      text,
  updated_at timestamptz not null default now(),
  primary key (order_id, tipo)
);

-- ============================================================================
-- RLS — solo lectura para admins, como el resto de las tablas de pedidos (010)
-- ============================================================================

alter table public.order_notifications enable row level security;

drop policy if exists order_notifications_select_admin on public.order_notifications;
create policy order_notifications_select_admin on public.order_notifications
  for select to authenticated using ((select public.is_admin()));

-- Sin política de INSERT/UPDATE para nadie: la tabla se escribe solo con
-- registrar_aviso_estado(), que corre con service_role. Que el panel pudiera marcar un aviso
-- como enviado sin enviarlo sería un rastro que miente (mismo razonamiento que email_sent_at).
revoke all on table public.order_notifications from anon;
revoke insert, update, delete, truncate on table public.order_notifications
  from anon, authenticated;

-- ============================================================================
-- registrar_aviso_estado(uuid, text, text) — el rastro del envío
-- ============================================================================
-- p_error null  → el proveedor aceptó el correo: se marca la hora y se limpia el error.
-- p_error texto → falló: se guarda el motivo y sent_at NO se toca. Si un reintento falla
--                 después de un envío bueno, el panel muestra el error (es lo último que
--                 pasó) pero la fecha del envío anterior sigue ahí, que también es cierta.
--
-- Solo service_role: la llama el servidor de la tienda después de hablar con el proveedor.

create or replace function public.registrar_aviso_estado(
  p_order_id uuid, p_tipo text, p_error text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Un mensaje claro y no un 23514 del CHECK: el que llama es código nuestro, y un tipo
  -- desconocido es un error de programación que conviene ver con nombre.
  if p_tipo not in ('aprobado', 'enviado', 'entregado') then
    raise exception 'registrar_aviso_estado: tipo desconocido %', p_tipo using errcode = '22023';
  end if;

  if p_error is null then
    insert into public.order_notifications (order_id, tipo, sent_at, error)
    values (p_order_id, p_tipo, now(), null)
    on conflict (order_id, tipo)
    do update set sent_at = now(), error = null, updated_at = now();
  else
    -- Recortado: es un mensaje para el dueño, no un volcado de la respuesta del proveedor.
    insert into public.order_notifications (order_id, tipo, sent_at, error)
    values (p_order_id, p_tipo, null, left(p_error, 500))
    on conflict (order_id, tipo)
    do update set error = left(p_error, 500), updated_at = now();
  end if;
end $$;

revoke all    on function public.registrar_aviso_estado(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.registrar_aviso_estado(uuid, text, text) to service_role;
