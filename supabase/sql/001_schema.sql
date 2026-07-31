-- 001_schema.sql
-- Supabase backend — schema foundation.
--
-- What the front end needs to consume this: docs/frontend-contract.md
-- Every endpoint with its request and response:  docs/api-endpoints.md
--
-- Idempotency convention (kept for the whole file): `create table if not exists`,
-- `drop constraint if exists X` immediately before `add constraint X`,
-- `create or replace function`. Re-pasting this file must never error.
--
-- Execution order in the SQL Editor: 001 -> 002 -> 003 -> 005 -> 006 -> 007 -> 008.
--
-- Deliberate gap at 004: that slot held a seed file (6 categories + 30 factory products)
-- which was REMOVED by owner decision on 2026-07-30. The catalog starts completely empty —
-- `categories` and `products` have no seed at all, and every row is created by hand through
-- the admin panel. The numbering gap is intentional: 005-008 keep their file names because
-- the docs reference them by number. Do not renumber them, and do not go looking for a
-- missing 004 file.
--
-- One consequence worth knowing before reading 003: with no seed there is no recovery row
-- set, which is exactly why publish_catalog() carries a guard against publishing an empty
-- draft over a populated catalog.

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.admins (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  email      text,                                    -- display only; may go stale
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  key            text     primary key,                -- tote, neceser, lumiere, tote-luxury,
  label          text     not null,                   -- cosmetiquera, makeup-bag
  default_price  integer  not null check (default_price >= 0),
  personalizable boolean  not null,
  max_initials   smallint not null default 0 check (max_initials >= 0),
  has_variant    boolean  not null default false,
  position       smallint not null,
  constraint categories_position_key unique (position)  -- non-deferrable: never reordered via API
);

create table if not exists public.products (
  id             text        primary key,             -- t1 … m4, custom_<epoch_ms>
  category_key   text        not null references public.categories(key) on update cascade,
  name           text        not null check (length(btrim(name)) > 0),
  color          text        not null,
  variant        text,
  hex            text        check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  price          integer     not null check (price >= 0),      -- COP, integer currency
  personalizable boolean     not null default false,
  max_initials   smallint    not null default 0 check (max_initials >= 0),
  group_key      text        not null,
  origin         text        not null default 'custom' check (origin in ('factory','custom')),
  is_active      boolean     not null default true,
  sort_order     integer     not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint products_category_sort_key unique (category_key, sort_order)
    deferrable initially deferred                     -- D2: in-place permutation (reorder)
);
-- NO hex-XOR-variant constraint: factory row t1 carries BOTH hex and variant on purpose.

create table if not exists public.product_photos (
  id           bigint      generated always as identity primary key,
  product_id   text        not null references public.products(id) on delete cascade,
  storage_path text        not null                   -- D1: bucket-relative key, never bucket-prefixed
    check (storage_path ~ '^[A-Za-z0-9_-]+/[0-9]+\.(webp|jpg|jpeg|png)$'),
  position     smallint    not null check (position >= 0),   -- 0 = main photo
  created_at   timestamptz not null default now(),
  constraint product_photos_product_position_key unique (product_id, position)  -- D2: non-deferrable
);

create table if not exists public.publications (
  id                 bigint      generated always as identity primary key,
  published_by       uuid        not null,            -- D5: no FK, audit outlives admin revocation
  published_by_email text,
  published_at       timestamptz not null default now(),
  product_count      integer     not null check (product_count >= 0),
  photo_count        integer     not null check (photo_count >= 0),
  removed_paths      text[]      not null default '{}'
);

-- ============================================================================
-- Draft twins (D4) — LIKE for the drift-prone part, explicit DDL for the
-- semantics-prone part (PK, FK, and whether a UNIQUE stays DEFERRABLE).
-- ============================================================================

create table if not exists public.products_draft (
  like public.products including defaults including constraints including comments
);
alter table public.products_draft drop constraint if exists products_draft_pkey;
alter table public.products_draft add  constraint products_draft_pkey primary key (id);
alter table public.products_draft drop constraint if exists products_draft_category_fkey;
alter table public.products_draft add  constraint products_draft_category_fkey
  foreign key (category_key) references public.categories(key) on update cascade;
alter table public.products_draft drop constraint if exists products_draft_category_sort_key;
alter table public.products_draft add  constraint products_draft_category_sort_key
  unique (category_key, sort_order) deferrable initially deferred;

create table if not exists public.product_photos_draft (
  like public.product_photos including defaults including identity including constraints including comments
);
alter table public.product_photos_draft drop constraint if exists product_photos_draft_pkey;
alter table public.product_photos_draft add  constraint product_photos_draft_pkey primary key (id);
alter table public.product_photos_draft drop constraint if exists product_photos_draft_product_fkey;
alter table public.product_photos_draft add  constraint product_photos_draft_product_fkey
  foreign key (product_id) references public.products_draft(id) on delete cascade;
alter table public.product_photos_draft drop constraint if exists product_photos_draft_product_position_key;
alter table public.product_photos_draft add  constraint product_photos_draft_product_position_key
  unique (product_id, position);  -- D2: non-deferrable, same as the published twin

comment on column public.product_photos_draft.created_at is
  'Row-creation time, not upload time. The authoritative upload epoch lives in storage_path — '
  'replace_product_photos_draft() resets this column on every whole-array replace.';

-- ============================================================================
-- Functions: set_updated_at() trigger + is_admin()
-- ============================================================================

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.products_draft;
create trigger set_updated_at before update on public.products_draft
  for each row execute function public.set_updated_at();

-- is_admin(): the single authorization predicate every write policy calls.
-- SECURITY DEFINER is mandatory, not convenience — a policy's own subquery is itself
-- subject to RLS on the table it reads, so a plain `EXISTS (... FROM admins ...)` inside
-- the admins SELECT policy would recurse (42P17). Definer rights read admins as owner,
-- outside RLS. STABLE (not IMMUTABLE, it reads a table) is the precondition for the
-- `(SELECT public.is_admin())` InitPlan form used in every policy in 002_rls.sql.
create or replace function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.admins a where a.user_id = auth.uid()) $$;

revoke all    on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated, service_role;
