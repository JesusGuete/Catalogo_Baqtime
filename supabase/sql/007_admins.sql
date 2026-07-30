-- 007_admins.sql
-- Supabase backend — admin bootstrap.
-- Admin authentication flow: docs/api-endpoints.md §1.
--
-- Admin #1 was already created via the dashboard (Authentication -> Users -> Add user)
-- before this file runs. UUIDs are not secrets; committing them is the intended audit trail.
--
-- Idempotent: on conflict do nothing.

insert into public.admins (user_id, email)
values ('d96c740b-07f5-43df-b609-366de4f0c777', 'baqtime@gmail.com')
on conflict (user_id) do nothing;
