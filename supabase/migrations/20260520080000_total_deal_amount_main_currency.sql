-- ============================================================
-- M5 fix: customers.total_deal_amount only sums the main currency
-- ============================================================
-- refresh_customer_deal_stats summed deal_amount across ALL currencies
-- into total_deal_amount, so a customer with USD + EUR + AED deals got
-- a meaningless blended figure on their card. The concentration-risk
-- function was already made currency-aware; this denormalised field
-- was not.
--
-- Fix: total_deal_amount now sums only deals in the configured main
-- currency (NULL currency treated as USD). total_deal_count stays a
-- plain count of all deals — a count is currency-agnostic; only the
-- amount cannot be blended.
--
-- Body verbatim from 20260515100000_phase2_enhancements.sql except the
-- total_deal_amount sub-select.
-- ============================================================

create or replace function public.refresh_customer_deal_stats()
returns trigger as $$
declare
  target_customer_id uuid;
  v_main_currency text;
begin
  if TG_OP = 'DELETE' then
    target_customer_id := old.customer_id;
  else
    target_customer_id := new.customer_id;
  end if;

  v_main_currency := upper(coalesce(
    (select s.value #>> '{}' from public.system_settings s where s.key = 'main_currency'),
    'USD'
  ));

  update public.customers
  set total_deal_count = (
        select count(*) from public.deals
        where customer_id = target_customer_id
      ),
      -- M5: 只累加主货币的成交额,避免 USD/EUR/AED 跨币种混加成无意义的数
      total_deal_amount = (
        select coalesce(sum(deal_amount), 0) from public.deals
        where customer_id = target_customer_id
          and upper(coalesce(currency, 'USD')) = v_main_currency
      ),
      first_deal_date = (
        select min(deal_date) from public.deals
        where customer_id = target_customer_id
      ),
      updated_at = now()
  where id = target_customer_id;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql security definer;
