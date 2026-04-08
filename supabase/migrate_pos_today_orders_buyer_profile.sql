-- Include buyer profile fields in POS today-orders RPC payload.
-- Safe to run repeatedly.

create or replace function public.pos_list_orders_for_booth_day(
  p_booth_id uuid,
  p_day date default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'created_at', o.created_at,
        'final_amount', o.final_amount,
        'discount_amount', o.discount_amount,
        'total_amount', o.total_amount,
        'buyer_gender', o.buyer_gender,
        'buyer_age_group', o.buyer_age_group,
        'buyer_motivation', o.buyer_motivation,
        'items', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', oi.product_name,
                'size', oi.size,
                'quantity', oi.quantity,
                'unit_price_cents', oi.unit_price_cents,
                'line_total_cents', oi.line_total_cents,
                'is_gift', oi.is_gift,
                'is_manual_free', oi.is_manual_free,
                'gift_id', oi.gift_id,
                'source', oi.source
              )
              order by oi.sort_order
            ),
            '[]'::jsonb
          )
          from public.order_items oi
          where oi.order_id = o.id
        )
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  from public.orders o
  where o.booth_id = p_booth_id
    and (timezone('Asia/Taipei', o.created_at))::date = coalesce(
      p_day,
      (timezone('Asia/Taipei', now()))::date
    );
$$;

grant execute on function public.pos_list_orders_for_booth_day(uuid, date) to anon;
grant execute on function public.pos_list_orders_for_booth_day(uuid, date) to authenticated;
