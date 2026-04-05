-- Fix: "new row violates row-level security policy for table promotions"
-- Run once in Supabase → SQL Editor (Dashboard).
--
-- Your project likely has SELECT-only policies on `promotions`. The admin UI
-- uses the anon key, so INSERT/UPDATE/DELETE need an explicit policy.
--
-- Production: remove this and use authenticated users or Edge Functions + service role.

alter table public.promotions enable row level security;

drop policy if exists "promotions_write_anon" on public.promotions;
create policy "promotions_write_anon" on public.promotions
  for all
  using (true)
  with check (true);
