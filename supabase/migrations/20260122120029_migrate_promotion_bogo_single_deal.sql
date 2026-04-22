-- BUY_X_GET_Y: optional "single bundle only" (no multi-stack of X+Y groups).
alter table public.promotions
  add column if not exists bogo_single_deal_only boolean not null default false;

comment on column public.promotions.bogo_single_deal_only is
  'When true and kind=BUY_X_GET_Y, at most one free-Y group applies (no repeating stack).';
