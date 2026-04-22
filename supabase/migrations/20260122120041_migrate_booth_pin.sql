-- POS 攤位進入驗證碼（4–6 位數字，選填）
-- 注意：PIN 以明文儲存且 anon 可 SELECT 時，前端可自行比對；若有合規需求請改為 Edge Function / RPC 僅回傳比對結果，勿將 PIN 下發至前端。

alter table public.booths
  add column if not exists pin text;

comment on column public.booths.pin is 'POS 進入驗證碼，4–6 位純數字；NULL 或空字串表示不需驗證';

alter table public.booths
  drop constraint if exists booths_pin_format_ck;

alter table public.booths
  add constraint booths_pin_format_ck check (
    pin is null
    or (
      length(trim(pin)) >= 4
      and length(trim(pin)) <= 6
      and trim(pin) ~ '^[0-9]+$'
    )
  );
