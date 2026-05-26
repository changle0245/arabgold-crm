-- ============================================================
-- H2 fix: exclude cancelled deals from revenue / cycle aggregates
-- ============================================================
-- A deal with status 'cancelled' is not realised revenue, yet it was
-- counted in monthly revenue, MoM/YoY, target progress, the 6-month
-- trend, the salesperson ranking, the reorder rate, the personal-
-- dashboard figures, and the reorder-cycle scan.
--
-- This migration excludes cancelled deals from the two server-side
-- aggregates. The dashboard pages exclude them client-side (separate
-- code change). coalesce(status,'pending') keeps a NULL-status row
-- (never happens in practice — the column defaults to 'pending')
-- counted as a live deal rather than silently dropped.
-- ============================================================

-- ── get_company_month_revenue: add the cancelled filter ───────────
-- (H1 created this function; H2 aligns it with the same exclusion the
--  dashboards now apply to "my revenue", keeping the share ratio sound.)
create or replace function public.get_company_month_revenue(p_month_start date)
returns numeric
language sql
security definer
as $$
  select coalesce(sum(d.deal_amount), 0)
  from public.deals d
  where d.deal_date >= p_month_start
    and coalesce(d.status, 'pending') <> 'cancelled'
    and upper(coalesce(d.currency, 'USD')) = upper(coalesce(
      (select s.value #>> '{}' from public.system_settings s where s.key = 'main_currency'),
      'USD'
    ));
$$;

-- ── scan_reorder_cycle_reminders: ignore cancelled deals ──────────
-- Body verbatim from 20260516040000_reorder_cycle_reminders.sql except
-- the join now filters out cancelled deals — a cancelled order is not a
-- real purchase and must not feed the reorder-cycle interval math.
create or replace function public.scan_reorder_cycle_reminders()
returns table(
  customers_scanned integer,
  reminders_created integer,
  customer_names text[]
)
language plpgsql
security definer
as $$
declare
  v_scanned integer := 0;
  v_created integer := 0;
  v_names text[] := array[]::text[];
  v_customer record;
  v_existing_reminder_count integer;
  v_deal_dates date[];
  v_avg_cycle_days numeric;
  v_days_since_last_deal integer;
begin
  -- Scan customers who have >= 2 non-cancelled deals
  for v_customer in
    select
      c.id as customer_id,
      c.contact_name,
      c.owner_id,
      array_agg(d.deal_date order by d.deal_date desc) as deal_dates,
      count(d.id) as deal_count,
      max(d.deal_date) as last_deal_date
    from public.customers c
    join public.deals d on d.customer_id = c.id
    where c.owner_id is not null
      and d.deal_date is not null
      and coalesce(d.status, 'pending') <> 'cancelled'
    group by c.id, c.contact_name, c.owner_id
    having count(d.id) >= 2
  loop
    v_scanned := v_scanned + 1;

    -- Average cycle from the most recent 3 deals (or all if < 3)
    v_deal_dates := v_customer.deal_dates[1:least(3, array_length(v_customer.deal_dates, 1))];

    if array_length(v_deal_dates, 1) >= 2 then
      declare
        v_total_days integer := 0;
        v_intervals integer := 0;
        i integer;
      begin
        for i in 1..(array_length(v_deal_dates, 1) - 1) loop
          v_total_days := v_total_days + (v_deal_dates[i] - v_deal_dates[i + 1]);
          v_intervals := v_intervals + 1;
        end loop;

        if v_intervals > 0 then
          v_avg_cycle_days := v_total_days::numeric / v_intervals;
        else
          continue;
        end if;
      end;
    else
      continue;
    end if;

    v_days_since_last_deal := current_date - v_customer.last_deal_date;

    if v_days_since_last_deal > v_avg_cycle_days then
      select count(*) into v_existing_reminder_count
      from public.reminders
      where customer_id = v_customer.customer_id
        and type = 'reorder_cycle'
        and status = 'pending';

      if v_existing_reminder_count = 0 then
        insert into public.reminders (
          customer_id, assigned_to, type, due_date, status, note, created_by
        ) values (
          v_customer.customer_id,
          v_customer.owner_id,
          'reorder_cycle',
          current_date + interval '1 day',
          'pending',
          format('该客户通常每 %s 天返单，距上次成交已 %s 天', round(v_avg_cycle_days), v_days_since_last_deal),
          null
        );
        v_created := v_created + 1;
        v_names := array_append(v_names, v_customer.contact_name);
      end if;
    end if;
  end loop;

  return query select v_scanned, v_created, v_names;
end;
$$;
