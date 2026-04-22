-- Optional activity period for booths (shift warnings & display only).

alter table public.booths
  add column if not exists start_date date null,
  add column if not exists end_date date null;

comment on column public.booths.start_date is 'Inclusive activity start; null = no lower bound.';
comment on column public.booths.end_date is 'Inclusive activity end; null = no upper bound.';
