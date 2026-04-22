-- Add is_active to categories (safe to re-run).
alter table public.categories add column if not exists is_active boolean not null default true;
