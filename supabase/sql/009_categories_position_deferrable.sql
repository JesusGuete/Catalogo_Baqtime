-- 009_categories_position_deferrable.sql
-- Makes categories_position_key DEFERRABLE INITIALLY DEFERRED, so reordering
-- categories in one batch upsert works the same way products_draft already does.
--
-- Run after 008_category_rules.sql. Idempotent: drop-if-exists + re-add.
--
-- WHY THIS EXISTS
-- 001_schema.sql:42 declared this constraint NON-deferrable on purpose, with the
-- comment "never reordered via API" — true at the time, because nothing called
-- categories.repo.ts's reordenar() yet. That changed when the admin panel got
-- drag-to-reorder for categories: reordenar() sends one POST with
-- `Prefer: resolution=merge-duplicates` (an upsert), assuming — same as
-- products.repo.ts's reordenar() already correctly assumes for
-- products_draft's (category_key, sort_order) constraint — that Postgres only
-- checks the UNIQUE constraint against the FINAL result of the statement, not
-- against every intermediate row as it's written.
--
-- That assumption is only true for a constraint declared DEFERRABLE INITIALLY
-- DEFERRED. A non-deferrable UNIQUE index is enforced immediately, per row, as
-- the multi-row upsert writes each one — so moving category A from position 2
-- to 1 while category B is still sitting at position 1 (about to move to 2, but
-- not processed yet) trips a real 23505 mid-statement, even though the batch as
-- a whole is a valid permutation. That's exactly the error the admin hit
-- dragging a category: "Ya hay otra categoría en esa posición."
--
-- No code changes needed: categories.repo.ts's reordenar() was already written
-- for deferred-constraint semantics (same shape as the products one) — the
-- schema just didn't back that up yet for this particular constraint.

alter table public.categories drop constraint if exists categories_position_key;
alter table public.categories add  constraint categories_position_key
  unique (position) deferrable initially deferred;
