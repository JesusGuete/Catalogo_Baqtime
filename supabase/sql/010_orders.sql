-- 010_orders.sql
-- Supabase backend — orders, order items, and the customer-facing status timeline.
--
-- Run after 009_categories_position_deferrable.sql. Idempotent, same conventions as the
-- rest of this directory: `create table if not exists`, `drop policy if exists` before
-- every `create policy`, `create or replace function`. Re-pasting this file must never error.
--
-- WHY THIS EXISTS: until now an order left no trace anywhere. The checkout built a WhatsApp
-- message, cleared the cart and navigated away — the only record of the sale was a chat
-- message. There was no order number, no way for the customer to check status, and nothing
-- to reconcile against. Orders now live here; WhatsApp is only the payment-coordination
-- channel.
--
-- WHAT DOES *NOT* HAPPEN HERE: orders have no draft/publish cycle. publish_catalog() never
-- touches these tables. An order is a fact the moment the customer confirms it.

-- ============================================================================
-- Tables
-- ============================================================================

-- Human-readable order numbers (BQ-00001). A sequence, not count(*)+1: the latter races
-- under concurrent checkouts and would hand two customers the same number.
create sequence if not exists public.orders_number_seq;

create table if not exists public.orders (
  id              uuid        primary key default gen_random_uuid(),

  -- TWO IDENTIFIERS, AND THE DIFFERENCE IS THE WHOLE SECURITY MODEL:
  --   order_number is short, sequential and MEANT to be readable — it goes in the WhatsApp
  --     message and is spoken out loud. It is therefore trivially guessable and must NEVER
  --     grant access to anything.
  --   public_token is the capability. gen_random_uuid() is 122 bits of CSPRNG randomness,
  --     so enumerating it is not a threat model, it is arithmetic.
  -- Anyone who swaps these two around reopens the exact hole this split exists to close.
  order_number    text        not null unique
                    default 'BQ-' || lpad(nextval('public.orders_number_seq')::text, 5, '0'),
  public_token    text        not null unique default gen_random_uuid()::text,

  -- Six of these are the linear flow. 'no_confirmado' is not a step in it — it is the flow
  -- being interrupted because the customer never paid. See expire_stale_orders() below.
  status          text        not null default 'pendiente_pago'
                    check (status in ('pendiente_pago', 'aprobado', 'en_produccion',
                                      'listo_para_envio', 'enviado', 'entregado',
                                      'no_confirmado')),

  -- Customer + shipping. Mirrors what the checkout form collects (src/lib/shipping-validation.js).
  customer_name   text        not null check (length(btrim(customer_name)) > 0),
  customer_phone  text        not null check (length(btrim(customer_phone)) > 0),
  customer_doc    text,
  ship_city       text        not null check (length(btrim(ship_city)) > 0),
  ship_address    text        not null check (length(btrim(ship_address)) > 0),

  -- Money: integer COP, never decimals — same convention as products.price.
  -- These are FROZEN at checkout on purpose. If a product's price changes tomorrow, this
  -- order must still show what was actually charged. That is also why order_items carries
  -- copies rather than joining live catalog rows.
  subtotal        integer     not null check (subtotal >= 0),
  shipping_cost   integer     not null check (shipping_cost >= 0),
  total           integer     not null check (total >= 0),

  -- Payment is confirmed by hand by the owner (bank transfer / Nequi over WhatsApp).
  -- No payment gateway is involved, so paid_at is the only source of truth.
  paid_at         timestamptz,
  payment_note    text,

  -- Shipping. `carrier` is free text and NOT a check-constrained enum on purpose: the
  -- carrier is a business relationship, not a schema decision. Adding a second one later
  -- must not require a migration.
  carrier         text,
  tracking_number text,
  shipped_at      timestamptz,
  -- Manual and optional. Left null when unknown, and the customer view simply omits it —
  -- better than computing a delivery date the workshop never promised.
  estimated_date  date,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- THE ID DOCUMENT IS REQUIRED EVERYWHERE EXCEPT BARRANQUILLA.
  -- Outside the city the parcel ships with a carrier and the recipient needs an ID to
  -- collect it; inside, delivery is local and asking for it is friction with no purpose.
  --
  -- Matched by CONTAINMENT, not equality, because customers type the field freely:
  -- 'Barranquilla', 'BARRANQUILLA' and 'Barranquilla, Atlántico' all count as local.
  -- No unaccent() needed — the word itself carries no accents, so lower() is enough, and
  -- lower()/position() are both IMMUTABLE, which a CHECK constraint requires.
  --
  -- This lives in the database as well as in the form because the browser can be bypassed:
  -- the endpoint revalidates, but the table is what makes the rule unbreakable.
  constraint orders_doc_required_outside_barranquilla check (
    (customer_doc is not null and length(btrim(customer_doc)) > 0)
    or position('barranquilla' in lower(ship_city)) > 0
  )
);

create table if not exists public.order_items (
  id              bigint      generated always as identity primary key,
  order_id        uuid        not null references public.orders(id) on delete cascade,

  -- NO FOREIGN KEY TO products, AND THIS IS LOAD-BEARING:
  -- publish_catalog() (003_functions.sql:108-109) deletes EVERY row of public.products and
  -- reinserts them on each publish. A FK here would either abort every publish or cascade
  -- order history into oblivion. product_id is kept as a plain reference for reporting; the
  -- columns below are a SNAPSHOT taken at checkout, which is also what an invoice line
  -- legally is — what was sold at that moment, not what the catalog says today.
  product_id      text,
  product_name    text        not null,
  category_key    text,
  category_label  text,
  color           text,
  variant         text,
  initials        text,
  initials_color  text,

  unit_price      integer     not null check (unit_price >= 0),
  extra_price     integer     not null default 0 check (extra_price >= 0),
  -- Always 1 today: the cart deliberately models one line per unit, because two identical
  -- totes can carry different embroidered initials (see src/lib/cart-store.js:10-13).
  -- The column exists so that a future non-personalizable bulk line does not need a migration.
  quantity        integer     not null default 1 check (quantity > 0),
  line_total      integer     not null check (line_total >= 0)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- The timeline the customer sees, and the audit trail the owner reads. Append-only by
-- construction: nothing in this file ever updates or deletes a row here.
create table if not exists public.order_status_history (
  id          bigint      generated always as identity primary key,
  order_id    uuid        not null references public.orders(id) on delete cascade,
  status      text        not null,
  note        text,
  -- null = written by the system (the checkout endpoint, or the expiry sweep), not by a
  -- person. No FK, for the same reason publications.published_by has none: an audit row
  -- must outlive the admin it recorded.
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists order_status_history_order_id_idx
  on public.order_status_history (order_id, created_at);

-- Drives expire_stale_orders(): without it that sweep is a full scan of every order ever
-- placed, on a schedule.
create index if not exists orders_pendientes_idx
  on public.orders (created_at) where status = 'pendiente_pago';

-- Reuses the trigger function defined in 001_schema.sql:123.
drop trigger if exists set_updated_at on public.orders;
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — admin-only. The customer never touches these tables.
-- ============================================================================
-- Note the asymmetry with the catalog: categories/products are publicly READABLE and this
-- is not. A customer reads their order through get_order_by_token() below, which is
-- SECURITY DEFINER and returns a hand-picked column list. That indirection is the point —
-- the "what may a stranger see" decision lives in one function, in SQL, instead of being
-- re-derived by every page that renders an order.

alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists orders_select_admin on public.orders;
create policy orders_select_admin on public.orders
  for select to authenticated using ((select public.is_admin()));

drop policy if exists orders_update_admin on public.orders;
create policy orders_update_admin on public.orders
  for update to authenticated using ((select public.is_admin()))
                                with check ((select public.is_admin()));

drop policy if exists order_items_select_admin on public.order_items;
create policy order_items_select_admin on public.order_items
  for select to authenticated using ((select public.is_admin()));

drop policy if exists order_status_history_select_admin on public.order_status_history;
create policy order_status_history_select_admin on public.order_status_history
  for select to authenticated using ((select public.is_admin()));

-- No INSERT policy anywhere, for anyone:
--   * orders / order_items are written by the checkout endpoint with the service_role key,
--     which bypasses RLS. That endpoint runs on the server and recomputes every price from
--     the catalog, so the browser never gets to state what something costs.
--   * order_status_history is written exclusively by the SECURITY DEFINER functions below,
--     so status and history can never drift apart.

-- ============================================================================
-- Grant-level defense in depth (does not depend on policy correctness)
-- ============================================================================

revoke all on table public.orders, public.order_items, public.order_status_history
  from anon;
revoke insert, update, delete, truncate
  on table public.order_items, public.order_status_history
  from anon, authenticated;
-- orders has no INSERT/DELETE policy either, so RLS already refuses both. Revoked anyway:
-- a grant that was never given cannot be leaned on by mistake later.
revoke insert, delete, truncate on table public.orders from anon, authenticated;

-- COLUMN-LEVEL GRANTS, and this is what makes the history trustworthy.
-- The UPDATE policy above says "an admin may update an order". It cannot say WHICH columns —
-- RLS has no column granularity. Grants do. So an admin may edit the logistics fields
-- directly, while status / paid_at / shipped_at / the money are reachable ONLY through the
-- functions below, which always append to order_status_history in the same transaction.
-- Without this, a plain PATCH from the panel could move an order to 'entregado' and leave
-- the customer's timeline showing 'aprobado' forever.
revoke update on table public.orders from anon, authenticated;
grant update (carrier, tracking_number, estimated_date, payment_note)
  on table public.orders to authenticated;

-- ============================================================================
-- get_order_by_token(text) — the customer's read path
-- ============================================================================
-- SECURITY DEFINER because orders has no policy for anon at all. The token IS the
-- authorization: holding it is the proof, exactly like a password-reset link.
--
-- The returned object is an explicit allowlist. Deliberately ABSENT, even though the row
-- has them: customer_doc, ship_address, payment_note, id (the internal uuid), and
-- created_by on each history row. A tracking page that leaks the customer's ID document to
-- anyone holding the link would be a worse privacy failure than having no tracking page.
--
-- Returns null (not an exception) for an unknown token, so the page can answer 404 without
-- distinguishing "never existed" from "deleted".

create or replace function public.get_order_by_token(p_token text)
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
  where o.public_token = p_token;
$$;

revoke all    on function public.get_order_by_token(text) from public;
grant  execute on function public.get_order_by_token(text) to anon, authenticated;

-- ============================================================================
-- set_order_status(uuid, text, text) — the admin's write path for status
-- ============================================================================
-- One call, one transaction: the order moves and the timeline records it, or neither
-- happens. Two PostgREST calls (PATCH then POST) would be two transactions, and a failure
-- between them leaves an order whose history lies about it. Same reasoning that put
-- replace_product_photos_draft() in 003_functions.sql.

create or replace function public.set_order_status(
  p_order_id uuid, p_status text, p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  -- GRANT EXECUTE TO authenticated means any signed-in user reaches this body.
  -- This check MUST be the first executable statement.
  if not public.is_admin() then
    raise exception 'set_order_status: caller is not an admin' using errcode = '42501';
  end if;

  -- Validated here as well as by the table CHECK: a clear message beats 23514 surfacing
  -- in the panel as an unreadable constraint violation.
  if p_status not in ('pendiente_pago', 'aprobado', 'en_produccion',
                      'listo_para_envio', 'enviado', 'entregado', 'no_confirmado') then
    raise exception 'set_order_status: unknown status %', p_status using errcode = '22023';
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'set_order_status: unknown order %', p_order_id using errcode = '23503';
  end if;

  update public.orders
     set status = p_status,
         -- Stamped the first time it ships and never moved again: correcting a typo in the
         -- tracking number must not rewrite the shipment date.
         shipped_at = case
           when p_status = 'enviado' and shipped_at is null then now()
           else shipped_at
         end
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, created_by)
  values (p_order_id, p_status, p_note, v_actor);
end $$;

revoke all    on function public.set_order_status(uuid, text, text) from public, anon;
grant  execute on function public.set_order_status(uuid, text, text) to authenticated;

-- ============================================================================
-- confirm_order_payment(uuid, text) — "the money arrived"
-- ============================================================================
-- Its own function rather than a flag on set_order_status because it is the one transition
-- with a business rule attached: confirming payment ALWAYS approves the order. Leaving that
-- to the panel would mean the rule holds only as long as every caller remembers it.
--
-- IT DELIBERATELY ACCEPTS AN ORDER ALREADY MARKED 'no_confirmado', and that is what makes
-- the automatic expiry below safe to run at all: if the customer did pay and the owner just
-- had not confirmed it within the day, the sweep marks the order — and this function
-- un-marks it in one click. The automatic mark is a signal, never a verdict.

create or replace function public.confirm_order_payment(
  p_order_id uuid, p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_paid timestamptz;
begin
  if not public.is_admin() then
    raise exception 'confirm_order_payment: caller is not an admin' using errcode = '42501';
  end if;

  select paid_at into v_paid from public.orders where id = p_order_id;
  if not found then
    raise exception 'confirm_order_payment: unknown order %', p_order_id
      using errcode = '23503';
  end if;
  -- Idempotent: confirming twice (double click, retry after a timeout) must not move the
  -- payment date forward or add a second identical timeline entry.
  if v_paid is not null then
    return;
  end if;

  update public.orders
     set paid_at = now(),
         payment_note = coalesce(p_note, payment_note),
         status = 'aprobado'
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, created_by)
  values (p_order_id, 'aprobado', coalesce(p_note, 'Pago confirmado'), v_actor);
end $$;

revoke all    on function public.confirm_order_payment(uuid, text) from public, anon;
grant  execute on function public.confirm_order_payment(uuid, text) to authenticated;

-- ============================================================================
-- expire_stale_orders() — orders nobody ever paid for
-- ============================================================================
-- Moves every order still sitting in 'pendiente_pago' 24 h after it was created to
-- 'no_confirmado', writing each timeline row as the system (created_by = null).
--
-- WHY NO is_admin() CHECK, EXACTLY: pg_cron runs this with no JWT, so auth.uid() is null
-- and is_admin() would be false — an admin check would make the scheduled job the one
-- caller that can never run it. Instead: an anonymous caller (cron, i.e. no JWT at all) is
-- allowed, a signed-in NON-admin is refused. The function takes no arguments and cannot
-- target a chosen order; the worst a caller can do is make time's own effect happen a few
-- minutes sooner.
--
-- Safe to call as often as you like: the WHERE clause is what makes it idempotent, so a
-- second run seconds later touches nothing.

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

  -- Data-modifying CTE so the UPDATE and the collection of its ids are one statement.
  -- `RETURNING ... INTO` cannot be used here: on a multi-row UPDATE it keeps only the last
  -- row, which would silently write history for one order out of however many expired.
  with vencidos as (
    update public.orders
       set status = 'no_confirmado'
     where status = 'pendiente_pago'
       and paid_at is null
       and created_at < now() - interval '24 hours'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from vencidos;

  -- Empty array inserts zero rows, so no guard is needed for the common no-op run.
  insert into public.order_status_history (order_id, status, note, created_by)
  select unnest(v_ids), 'no_confirmado',
         'Sin pago confirmado 24 horas después del pedido', null;

  return coalesce(array_length(v_ids, 1), 0);
end $$;

revoke all    on function public.expire_stale_orders() from public, anon;
grant  execute on function public.expire_stale_orders() to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling, IF pg_cron is enabled — and this block can never break the migration.
-- ---------------------------------------------------------------------------
-- The panel also calls expire_stale_orders() when it opens the order list, so the feature
-- works whether or not this schedule exists. What pg_cron adds is that the sweep runs even
-- when nobody opens the panel — which matters for the customer's own tracking page.
--
-- To enable: Supabase Dashboard -> Database -> Extensions -> pg_cron, then re-run this file.
-- The EXECUTE indirection is deliberate: it keeps `cron.schedule` from being parsed at all
-- when the extension (and therefore the cron schema) does not exist.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cmd$
      select cron.schedule(
        'baqtime-expirar-pedidos',
        '*/30 * * * *',
        'select public.expire_stale_orders()'
      )
    $cmd$;
    raise notice 'pg_cron detectado: barrido de pedidos vencidos programado cada 30 min.';
  else
    raise notice 'pg_cron NO está activo. Los pedidos vencidos se marcan igual, pero solo '
                 'cuando se abre la lista de pedidos en el panel. Para automatizarlo: '
                 'Dashboard -> Database -> Extensions -> pg_cron, y volvé a correr este archivo.';
  end if;
end $$;
