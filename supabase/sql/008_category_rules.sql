-- 008_category_rules.sql
-- Moves four per-category business rules out of the front-end source and into data.
--
-- Run after 007_admins.sql. Idempotent: `add column if not exists`.
--
-- WHY THIS EXISTS
-- The Astro front (branch migracion/astro-react) hardcodes four rules by category key:
--
--   src/components/react/ProductView.jsx
--     category === "tote"       -> subtitle shows the variant instead of the category label
--     category === "tote"       -> extra initials are charged from the 4th onward
--     category === "neceser"    -> a different label on the initials field
--     IMPORTED_CATEGORIES = ["makeup-bag"]  -> "imported, 15-20 day delivery" notice
--
--   src/lib/initials.js
--     category === "makeup-bag" -> embroidery only in silver
--
-- Every one of those is an `if` against a string literal. The catalog now starts empty
-- and the owner creates every category through the admin panel, so a category the front
-- has never heard of is the NORMAL case, not the exception. A new imported category
-- would silently skip its delivery notice: no error, no log, nothing — just a customer
-- asking three weeks later where their order is.
--
-- Two of the five rules already had a home: `categories.has_variant` (which existed and
-- was unused) covers the tote subtitle, and `categories.max_initials` covers the field
-- label. The three columns below cover the rest.
--
-- DELIBERATELY NOT SOLVED HERE: the hex values of the initials palette stay in the
-- front's INITIALS_COLORS constant. That list is a brand palette, not a per-category
-- rule — it does not change when the owner adds a category, so it is not part of the
-- problem this file fixes. `initials_palette` stores color NAMES that the front resolves
-- against that constant.

alter table public.categories
  add column if not exists is_imported          boolean  not null default false,
  add column if not exists free_initials        smallint not null default 0,
  add column if not exists extra_initials_price integer  not null default 0,
  add column if not exists initials_palette     text[]   not null default '{}';

-- free_initials is how many initials the base price already covers. The charge rule is
-- `count > free_initials -> extra_initials_price`, so the defaults (0 and 0) mean
-- "no surcharge", which is what every category except tote does today.
alter table public.categories drop constraint if exists categories_free_initials_range;
alter table public.categories add  constraint categories_free_initials_range
  check (free_initials >= 0 and free_initials <= max_initials);

-- Catches the misconfiguration where a surcharge is set but can never be reached
-- (or vice versa) — both halves of the rule have to be present or both absent.
alter table public.categories drop constraint if exists categories_extra_price_nonneg;
alter table public.categories add  constraint categories_extra_price_nonneg
  check (extra_initials_price >= 0);

comment on column public.categories.is_imported is
  'Imported goods take 15-20 days. The product page shows a delivery notice when true.';
comment on column public.categories.free_initials is
  'Initials already covered by the base price. Charge extra_initials_price above this.';
comment on column public.categories.extra_initials_price is
  'Flat surcharge, in whole pesos, applied once when the initial count exceeds free_initials.';
comment on column public.categories.initials_palette is
  'Allowed embroidery colors, by name. Empty array means every color in the brand palette.';
