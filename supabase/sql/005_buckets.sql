-- 005_buckets.sql
-- Supabase backend — Storage buckets.
-- Upload, delete and public-read endpoints: docs/api-endpoints.md §4.
--
-- Two buckets, not one bucket with two prefixes: cleanup code that only ever holds a
-- product-images handle cannot express a site-images deletion target — not merely
-- forbidden by policy, structurally inexpressible (spec: catalog-media-storage).
--
-- file_size_limit and the MIME allowlist carry over the existing Firebase rules verbatim
-- (storage.rules:27-28, 5 * 1024 * 1024 + image/.*), narrowed to what the panel actually
-- produces (canvas.toBlob(..., 'image/webp', 0.80), main.js:1159).
--
-- Idempotent: on conflict (id) do nothing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
          array['image/webp','image/jpeg','image/png']),
       ('site-images',    'site-images',    true, 5242880,
          array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
