-- Migration 20260519040000
-- 修复 #11 遗漏：集中度风险 DB 函数 get_concentration_risk_customers() 此前跨币种 sum(deal_amount)。
-- boss 大屏已改为按 main_currency 展示，但这个 RPC 返回的 total_amount / revenue_share
-- 仍是混币种累加 → 数字错误，且 boss page 给它套了 currencySymbol 让符号"说谎"。
-- 修法：函数内读 main_currency，total_revenue 与各客户 total_amount 都只统计主货币的成交。
-- ------------------------------------------------------------

create or replace function public.get_concentration_risk_customers()
returns table(
  customer_id uuid,
  customer_name text,
  customer_company text,
  total_amount numeric,
  revenue_share numeric,
  deal_count bigint
)
language plpgsql
stable security definer
as $function$
declare
  v_threshold numeric;
  v_total_revenue numeric;
  v_main_currency text;
begin
  -- 阈值（默认 0.30）
  select coalesce((value)::numeric, 0.30) into v_threshold
  from public.system_settings
  where key = 'concentration_risk_threshold';

  -- 主货币（默认 USD）。system_settings.value 是 jsonb，字符串值带引号，用 #>>'{}' 取纯文本。
  select coalesce(upper(value #>> '{}'), 'USD') into v_main_currency
  from public.system_settings
  where key = 'main_currency';
  if v_main_currency is null then
    v_main_currency := 'USD';
  end if;

  -- 近 12 个月公司总营收 —— 仅主货币（修 #11）
  select coalesce(sum(deal_amount), 0) into v_total_revenue
  from public.deals
  where coalesce(upper(currency), 'USD') = v_main_currency
    and (
      deal_date >= current_date - interval '12 months'
      or (deal_date is null and created_at >= current_date - interval '12 months')
    );

  if v_total_revenue = 0 then
    return;
  end if;

  -- 超阈客户 —— 同样仅统计主货币成交
  return query
  select
    c.id as customer_id,
    c.contact_name as customer_name,
    c.company_name as customer_company,
    sum(d.deal_amount) as total_amount,
    round((sum(d.deal_amount) / v_total_revenue)::numeric, 4) as revenue_share,
    count(d.id) as deal_count
  from public.customers c
  join public.deals d on d.customer_id = c.id
  where coalesce(upper(d.currency), 'USD') = v_main_currency
    and (
      d.deal_date >= current_date - interval '12 months'
      or (d.deal_date is null and d.created_at >= current_date - interval '12 months')
    )
  group by c.id, c.contact_name, c.company_name
  having (sum(d.deal_amount) / v_total_revenue) > v_threshold
  order by revenue_share desc;
end;
$function$;

comment on function public.get_concentration_risk_customers() is
  '集中度风险客户：营收占比 = 单客户主货币成交额 / 公司主货币总营收（近12月）。修 #11：只统计 system_settings.main_currency 的成交，不再跨币种累加。';
