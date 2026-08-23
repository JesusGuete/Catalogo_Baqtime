-- 014_initials_colors.sql
-- Moves the embroidery palette out of the front-end source and into data.
--
-- Run after 008_category_rules.sql. Idempotent: `if not exists` + `on conflict do nothing`,
-- so re-running it never overwrites a color the owner edited from the panel.
--
-- WHY THIS EXISTS
-- 008 left the palette out ON PURPOSE, and said so under "DELIBERATELY NOT SOLVED": the
-- hex values were a brand constant, not a per-category rule, so they did not belong to
-- the problem that file was fixing. That reasoning held while the palette was fixed. It
-- is not fixed anymore — the owner wants to add and remove embroidery colors without a
-- deploy, the same way he already adds categories.
--
-- Leaving it in the front had also drifted into a real bug. The palette was hardcoded
-- TWICE, with DIFFERENT values, and nothing kept the two in sync:
--
--   src/lib/initials.js         9 colors   Negro #1A1A1A, Beige #C9B99A, Dorado #C9A24B…
--   admin/CategoriesView.tsx    5 colors   Plateado #C9C9C9, Dorado #9C7A3C, Blush #E7BEC1…
--
-- So the panel offered "Dorado #9C7A3C" while the store painted "Dorado #C9A24B", and it
-- offered Blush and Plateado, which the store's list did not contain at all. Ticking
-- either of those two in `initials_palette` produced a category whose allowed palette
-- resolved to NOTHING. One table, read by both sides, is what ends that.
--
-- WHAT DOES NOT CHANGE
-- `categories.initials_palette` (008) keeps its exact meaning: the color NAMES allowed
-- for that category, empty array = all of them. What changes is that the names resolve
-- against this table instead of a constant — and that the store finally HONORS the
-- column, which until now it ignored in favor of `category = 'makeup-bag'` written by
-- hand in src/lib/initials.js.

create table if not exists public.initials_colors (
  name       text        primary key,
  hex        text        not null,
  position   smallint    not null,
  created_at timestamptz not null default now()
);

-- The name IS the primary key, and not a surrogate id, because `initials_palette` is a
-- `text[]` of names (008) and `order_items.initials_color` already stores the name as
-- plain text. A surrogate key would mean rewriting both to keep a join that buys nothing:
-- two colors with the same name are not two colors, they are a typo.
alter table public.initials_colors drop constraint if exists initials_colors_name_no_vacio;
alter table public.initials_colors add  constraint initials_colors_name_no_vacio
  check (length(btrim(name)) > 0);

-- The hex reaches the browser as `--swatch-color`, straight into a style attribute. A
-- malformed value there does not throw: the swatch just renders transparent and the
-- customer sees an empty circle. Rejecting it at the door is cheaper than debugging that.
alter table public.initials_colors drop constraint if exists initials_colors_hex_formato;
alter table public.initials_colors add  constraint initials_colors_hex_formato
  check (hex ~* '^#[0-9a-f]{6}$');

-- DELIBERATELY NOT UNIQUE, unlike `categories.position`. That column being unique and
-- non-deferrable is what forced 009_categories_position_deferrable.sql, because any
-- reorder passes through a moment where two rows share a number. Ordering swatches in a
-- row is not worth that: ties just fall back to the name, which is stable.
create index if not exists initials_colors_position_idx
  on public.initials_colors (position, name);

comment on table public.initials_colors is
  'Brand embroidery palette. Read by the store and by the panel; categories.initials_palette references these names.';
comment on column public.initials_colors.name is
  'PK and the value stored in categories.initials_palette and order_items.initials_color.';
comment on column public.initials_colors.hex is
  'Swatch fill, #RRGGBB. Goes to the browser as a CSS custom property.';

-- ============================================================================
-- RLS: public read, admin write — same four policies as `categories` in 002_rls.sql
-- ============================================================================

alter table public.initials_colors enable row level security;

drop policy if exists initials_colors_select_public on public.initials_colors;
create policy initials_colors_select_public on public.initials_colors
  for select to anon, authenticated using (true);

drop policy if exists initials_colors_insert_admin on public.initials_colors;
create policy initials_colors_insert_admin on public.initials_colors
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists initials_colors_update_admin on public.initials_colors;
create policy initials_colors_update_admin on public.initials_colors
  for update to authenticated using ((select public.is_admin()))
                                with check ((select public.is_admin()));

drop policy if exists initials_colors_delete_admin on public.initials_colors;
create policy initials_colors_delete_admin on public.initials_colors
  for delete to authenticated using ((select public.is_admin()));

-- ============================================================================
-- Seed: exactly what the STORE was painting before this file existed
-- ============================================================================
-- The nine from src/lib/initials.js in their original order, plus Plateado, which lived
-- apart as PLATEADO_COLOR because only Makeup Bag used it. The store's hex values win
-- over the panel's wherever the two lists disagreed: those are the ones customers have
-- been looking at, and the panel's were never painted on anything.
--
-- `do nothing` and not `do update`: after the first run this table belongs to the owner.
insert into public.initials_colors (name, hex, position) values
  ('Negro',    '#1A1A1A', 1),
  ('Beige',    '#C9B99A', 2),
  ('Rosado',   '#D89AA0', 3),
  ('Mocca',    '#6B4A38', 4),
  ('Blanco',   '#FFFFFF', 5),
  ('Dorado',   '#C9A24B', 6),
  ('Vino',     '#6E1F2A', 7),
  ('Verde',    '#5C6B4A', 8),
  ('Azul',     '#25324A', 9),
  ('Plateado', '#B9BEC2', 10)
on conflict (name) do nothing;

-- Keeps Makeup Bag silver-only, which was a hardcoded rule in initials.js
-- (`category === "makeup-bag" ? [PLATEADO_COLOR] : INITIALS_COLORS`) and stops being one
-- the moment the store starts reading `initials_palette`. Without this line, the deploy
-- that removes the rule would silently offer nine embroidery colors on a product line
-- that is only ever embroidered in silver.
--
-- Only touches the row if the owner never set a palette for it: `= '{}'` is the guard.
update public.categories
   set initials_palette = array['Plateado']
 where key = 'makeup-bag'
   and initials_palette = '{}';
