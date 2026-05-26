-- ============================================================
-- H1 fix: company-wide monthly revenue RPC
-- ============================================================
-- Problem:
--   The personal dashboard's "本月个人业绩占比" needs company-wide
--   monthly revenue as the denominator. It queried `deals` directly
--   with no owner filter — but the deals RLS policy scopes a member's
--   SELECT to their own customers' deals. So for every salesperson the
--   "company total" silently equalled their own total and the share bar
--   always rendered 100%.
--
-- Fix:
--   A SECURITY DEFINER function that sums deal_amount across ALL deals,
--   bypassing RLS. It mirrors the frontend `sumInMainCurrency` logic:
--   only deals whose currency equals the configured main currency are
--   summed (NULL currency treated as USD). The month is passed in by
--   the caller so it matches the monthStart used for "my revenue".
--
--   Cancelled-deal exclusion is intentionally NOT applied here — that is
--   handled uniformly across every revenue path in the H2 fix.
-- ============================================================

create or replace function public.get_company_month_revenue(p_month_start date)
returns numeric
language sql
security definer
as $$
  select coalesce(sum(d.deal_amount), 0)
  from public.deals d
  where d.deal_date >= p_month_start
    and upper(coalesce(d.currency, 'USD')) = upper(coalesce(
      (select s.value #>> '{}' from public.system_settings s where s.key = 'main_currency'),
      'USD'
    ));
$$;

grant execute on function public.get_company_month_revenue(date) to authenticated;

comment on function public.get_company_month_revenue(date) is
  'Company-wide sum of deal_amount for deals on/after p_month_start in the configured main currency. SECURITY DEFINER so a member can read the company total (deals RLS would otherwise scope it to their own).';
